import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import {
  discoverAmbientCliPackages,
  uninstallAmbientCliPackageSource,
  type AmbientCliPackageCatalog,
  type UninstallAmbientCliPackageInput,
} from "../../ambient-cli/ambientCliPackages";
import {
  ambientCliPackageUninstallApprovalDetail,
  ambientCliPackageUninstallGrantIdentity,
  ambientCliPackageUninstallParams,
  ambientCliPackageUninstallingUpdate,
  ambientCliPackageUninstallResult,
} from "./agentRuntimeAmbientCliPackageUninstallModel";
import { selectAmbientCliPackageForRuntime } from "./agentRuntimeAmbientCliPackageSelection";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface AmbientCliPackageUninstallPermissionRequest {
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

export interface AmbientCliPackageUninstallToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  discoverAmbientCliPackages?: (workspacePath: string) => Promise<AmbientCliPackageCatalog> | AmbientCliPackageCatalog;
  uninstallAmbientCliPackageSource?: (
    workspacePath: string,
    input: UninstallAmbientCliPackageInput,
  ) => Promise<AmbientCliPackageCatalog> | AmbientCliPackageCatalog;
  resolveFirstPartyPluginPermission: (input: AmbientCliPackageUninstallPermissionRequest) => Promise<boolean> | boolean;
  markPluginToolsStale: () => void;
}

export function registerAmbientCliPackageUninstallTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: AmbientCliPackageUninstallToolRegistrationOptions,
): void {
  const { workspace } = options;
  const discoverPackages = options.discoverAmbientCliPackages ?? discoverAmbientCliPackages;
  const uninstallPackage = options.uninstallAmbientCliPackageSource ?? uninstallAmbientCliPackageSource;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_cli_package_uninstall"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("CLI package uninstall is blocked in Planner Mode.");
      const { packageId, packageName } = ambientCliPackageUninstallParams(params as Record<string, unknown>);
      const catalog = await discoverPackages(workspace.path);
      const pkg = selectAmbientCliPackageForRuntime(catalog.packages, { packageId, packageName });
      if (!pkg.installed) throw new Error("Only Ambient-installed CLI packages can be uninstalled.");
      const detail = ambientCliPackageUninstallApprovalDetail({ workspace, pkg });
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace,
        toolName: "ambient_cli_package_uninstall",
        title: `Uninstall Ambient CLI package "${pkg.name}"?`,
        message: "Ambient wants to remove this installed CLI package and its copied package files.",
        detail,
        grantTargetLabel: `Uninstall Ambient CLI package ${pkg.name}`,
        grantTargetIdentity: ambientCliPackageUninstallGrantIdentity(pkg),
        allowedReason: "Ambient CLI package uninstall approved by Ambient permission grant policy.",
        deniedReason: "Ambient CLI package uninstall prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Ambient CLI package uninstall blocked by approval prompt.");
      onUpdate?.(ambientCliPackageUninstallingUpdate(pkg));
      await uninstallPackage(workspace.path, { packageId: pkg.id });
      options.markPluginToolsStale();
      return ambientCliPackageUninstallResult(pkg);
    },
  });
}
