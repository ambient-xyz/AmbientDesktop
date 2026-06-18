import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk } from "../../../shared/permissionTypes";
import type { WorkspaceState } from "../../../shared/workspaceTypes";
import type { ThreadSummary } from "../../../shared/threadTypes";
import { pluginInstallToolDescriptor } from "../agentRuntimeDesktopToolFacade";
import { registerDesktopTool } from "../agentRuntimeDesktopToolFacade";
import {
  discoverPiPrivilegedPackages,
  selectPiPrivilegedPackage,
  uninstallPiPrivilegedPackage,
  type PiPrivilegedCatalog,
  type PiPrivilegedInstallSummary,
  type PiPrivilegedPackageSelector,
} from "./piPrivilegedPackages";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PiPrivilegedUninstallPermissionRequest {
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

export interface PiPrivilegedUninstallToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  discoverPiPrivilegedPackages?: (workspacePath: string) => Promise<PiPrivilegedCatalog> | PiPrivilegedCatalog;
  uninstallPiPrivilegedPackage?: (
    workspacePath: string,
    input: PiPrivilegedPackageSelector & { deleteData?: boolean },
  ) => Promise<{ removed: PiPrivilegedInstallSummary; catalog: PiPrivilegedCatalog; manualCleanup: string[] }> | { removed: PiPrivilegedInstallSummary; catalog: PiPrivilegedCatalog; manualCleanup: string[] };
  resolveFirstPartyPluginPermission: (input: PiPrivilegedUninstallPermissionRequest) => Promise<boolean> | boolean;
  revokePluginGrantsForLabels: (labels: string[]) => number;
  markPluginToolsStale: () => void;
}

export function registerPiPrivilegedUninstallTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiPrivilegedUninstallToolRegistrationOptions,
): void {
  const discoverPackages = options.discoverPiPrivilegedPackages ?? discoverPiPrivilegedPackages;
  const uninstallPackage = options.uninstallPiPrivilegedPackage ?? uninstallPiPrivilegedPackage;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_privileged_uninstall"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Privileged Pi uninstall is blocked in Planner Mode.");
      const input = params as Record<string, unknown>;
      const packageId = optionalString(input.packageId);
      const packageName = optionalString(input.packageName);
      const deleteData = optionalBoolean(input.deleteData) ?? false;
      const catalog = await discoverPackages(options.workspace.path);
      const pkg = selectPiPrivilegedPackage(catalog.packages, { packageId, packageName });
      const detail = [
        `Workspace: ${options.workspace.path}`,
        `Package: ${pkg.packageName}`,
        `Package id: ${pkg.id}`,
        `Package root: ${pkg.rootPath}`,
        `Delete data: ${deleteData ? "yes" : "no"}`,
      ].join("\n");
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace: options.workspace,
        toolName: "ambient_pi_privileged_uninstall",
        title: `Uninstall privileged Pi package "${pkg.packageName}"?`,
        message: "Ambient wants to remove this privileged Pi package using its manifest. Unmanaged direct Pi or host-app changes may require manual cleanup.",
        detail,
        grantTargetLabel: `Uninstall privileged Pi package ${pkg.packageName}`,
        grantTargetIdentity: ["ambient_pi_privileged_uninstall", pkg.id, deleteData ? "delete-data" : "keep-data"].join("\0"),
        allowedReason: "Privileged Pi uninstall approved by Ambient permission grant policy.",
        deniedReason: "Privileged Pi uninstall prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Privileged Pi uninstall blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Uninstalling privileged Pi package "${pkg.packageName}".` }],
        details: { runtime: "pi-privileged", toolName: "ambient_pi_privileged_uninstall", packageId: pkg.id, packageName: pkg.packageName, status: "uninstalling" },
      });
      const removed = await uninstallPackage(options.workspace.path, { packageId: pkg.id, deleteData });
      const revokedGrants = options.revokePluginGrantsForLabels([`Install privileged Pi package ${pkg.packageName}`, `Uninstall privileged Pi package ${pkg.packageName}`]);
      options.markPluginToolsStale();
      return {
        content: [{ type: "text" as const, text: piPrivilegedUninstallText(removed.removed, removed.manualCleanup, revokedGrants) }],
        details: { runtime: "pi-privileged", toolName: "ambient_pi_privileged_uninstall", packageId: pkg.id, packageName: pkg.packageName, revokedGrants, manualCleanup: removed.manualCleanup },
      };
    },
  });
}

function piPrivilegedUninstallText(pkg: PiPrivilegedInstallSummary, manualCleanup: string[], revokedGrants: number): string {
  return [
    "Privileged Pi package uninstalled",
    `Package: ${pkg.packageName}`,
    `Package id: ${pkg.id}`,
    `Revoked grants: ${revokedGrants}`,
    "Manifest-owned copied package state was removed.",
    manualCleanup.length ? `Manual cleanup notes:\n${manualCleanup.map((item) => `- ${item}`).join("\n")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}
