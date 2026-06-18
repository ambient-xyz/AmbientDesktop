import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type {
  CodexPluginCatalog,
  CodexPluginDependencyInstallResult,
} from "../../../shared/pluginTypes";
import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type {
  CodexPluginInstallCommitResult,
  CodexPluginInstallPreview,
  CommitCodexPluginInstallInput,
  PreviewCodexPluginInstallInput,
} from "../codex/codexPlugins";
import {
  pluginActivationApprovalDetail,
  pluginActivationDependencyInstallInput,
  pluginActivationDependencyInstallUpdate,
  pluginActivationDependencyState,
  pluginActivationInspectUpdate,
  pluginActivationMissingDependenciesMessage,
  pluginActivationParams,
  pluginActivationPermissionRequest,
  pluginActivationToolResult,
  pluginInstallCommitInput,
  pluginInstallCommitParams,
  pluginInstallCommitToolResult,
  pluginInstallInstallingUpdate,
  pluginInstallPermissionRequest,
  pluginInstallPreviewInput,
  pluginInstallPreviewUpdate,
  selectInstalledPluginForRuntime,
  selectPluginInstallCandidateForRuntime,
} from "./agentRuntimePluginInstallApplyModel";
import { pluginInstallToolDescriptor, registerDesktopTool } from "../pluginsDesktopToolFacade";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PluginInstallApplyPermissionRequest {
  thread: ThreadSummary;
  workspace: WorkspaceState;
  toolName: string;
  title: string;
  message: string;
  detail: string;
  risk?: PermissionRisk;
  reusableScopes?: PermissionGrantScopeKind[];
  grantTargetLabel: string;
  grantTargetIdentity?: string;
  grantConditions?: Record<string, unknown>;
  requireFreshPrompt?: boolean;
  allowedReason: string;
  deniedReason: string;
}

export interface PluginInstallApplyToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  previewCodexPluginInstall: (
    workspacePath: string,
    input: PreviewCodexPluginInstallInput,
  ) => Promise<CodexPluginInstallPreview> | CodexPluginInstallPreview;
  commitCodexPluginInstall: (
    workspacePath: string,
    input: CommitCodexPluginInstallInput,
  ) => Promise<CodexPluginInstallCommitResult> | CodexPluginInstallCommitResult;
  readCodexPluginCatalog: (workspacePath: string) => Promise<CodexPluginCatalog> | CodexPluginCatalog;
  installCodexPluginDependencies: (
    workspacePath: string,
    input: { pluginId: string },
  ) => Promise<CodexPluginDependencyInstallResult> | CodexPluginDependencyInstallResult;
  shutdownPluginMcpServers: () => Promise<void> | void;
  setPluginEnabled: (pluginId: string, enabled: boolean) => void;
  markPluginToolsStale: () => void;
  resolveFirstPartyPluginPermission: (input: PluginInstallApplyPermissionRequest) => Promise<boolean> | boolean;
}

export function registerPluginInstallApplyTools(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PluginInstallApplyToolRegistrationOptions,
): void {
  const { workspace } = options;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_plugin_install_commit"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Plugin installation is blocked in Planner Mode.");

      const { source, name, pluginId, pluginName } = pluginInstallCommitParams(params as Record<string, unknown>);
      const installInput = pluginInstallCommitInput({ source, name, pluginId, pluginName });

      onUpdate?.(pluginInstallPreviewUpdate({ source, pluginId, pluginName }));

      const previewResult = await options.previewCodexPluginInstall(workspace.path, pluginInstallPreviewInput({ source, name }));
      const selected = selectPluginInstallCandidateForRuntime(previewResult, { pluginId, pluginName });
      if (selected.compatibilityTier === "unsupported") {
        throw new Error(`Cannot install unsupported Codex plugin "${selected.displayName ?? selected.name}".`);
      }
      const allowed = await options.resolveFirstPartyPluginPermission(pluginInstallPermissionRequest({
        thread,
        workspace,
        source,
        name,
        pluginId,
        pluginName,
        preview: previewResult,
        selected,
      }));
      if (!allowed) throw new Error("Codex plugin install blocked by Ambient Desktop approval prompt.");

      onUpdate?.(pluginInstallInstallingUpdate({ source, selected }));

      const result = await options.commitCodexPluginInstall(workspace.path, installInput);
      await options.shutdownPluginMcpServers();
      options.markPluginToolsStale();
      return pluginInstallCommitToolResult({ source, result });
    },
  });

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_plugin_activate"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Plugin activation is blocked in Planner Mode.");

      const { pluginId, pluginName, installDependencies } = pluginActivationParams(params as Record<string, unknown>);

      onUpdate?.(pluginActivationInspectUpdate({ pluginId, pluginName, installDependencies }));

      const catalog = await options.readCodexPluginCatalog(workspace.path);
      const plugin = selectInstalledPluginForRuntime(catalog, { pluginId, pluginName });
      if (plugin.compatibilityTier === "unsupported") throw new Error(`Cannot activate unsupported Codex plugin "${plugin.displayName ?? plugin.name}".`);
      if (plugin.errors.length) throw new Error(`Cannot activate Codex plugin "${plugin.displayName ?? plugin.name}" because it has errors: ${plugin.errors.join("; ")}`);
      const { dependenciesRequired, dependenciesMissing } = pluginActivationDependencyState(plugin);
      if (dependenciesMissing && !installDependencies) {
        throw new Error(pluginActivationMissingDependenciesMessage(plugin));
      }

      const allowed = await options.resolveFirstPartyPluginPermission(pluginActivationPermissionRequest({
        thread,
        workspace,
        plugin,
        installDependencies,
      }));
      if (!allowed) throw new Error("Codex plugin activation blocked by Ambient Desktop approval prompt.");

      let dependencyInstallResult: CodexPluginDependencyInstallResult | undefined;
      if (installDependencies && dependenciesMissing) {
        onUpdate?.(pluginActivationDependencyInstallUpdate(plugin));
        dependencyInstallResult = await options.installCodexPluginDependencies(workspace.path, pluginActivationDependencyInstallInput(plugin));
      }

      options.setPluginEnabled(plugin.id, true);
      await options.shutdownPluginMcpServers();
      options.markPluginToolsStale();
      return pluginActivationToolResult({
        plugin,
        dependenciesRequired,
        installedDependencies: Boolean(dependencyInstallResult),
      });
    },
  });
}
