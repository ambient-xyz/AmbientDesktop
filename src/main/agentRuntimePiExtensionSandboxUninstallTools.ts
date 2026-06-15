import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { PermissionGrantScopeKind, PermissionRisk, ThreadSummary, WorkspaceState } from "../shared/types";
import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  discoverPiExtensionSandboxPackages,
  selectPiExtensionSandboxPackage,
  uninstallPiExtensionSandboxPackage,
  type PiExtensionSandboxCatalog,
  type PiExtensionSandboxPackageSummary,
} from "./piExtensionSandboxPackages";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PiExtensionSandboxUninstallPermissionRequest {
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

export interface PiExtensionSandboxUninstallToolRegistrationOptions {
  workspace: WorkspaceState;
  getThread: () => ThreadSummary;
  discoverPiExtensionSandboxPackages?: (workspacePath: string) => Promise<PiExtensionSandboxCatalog> | PiExtensionSandboxCatalog;
  uninstallPiExtensionSandboxPackage?: (
    workspacePath: string,
    input: { packageId?: string; packageName?: string },
  ) => Promise<{ removed: PiExtensionSandboxPackageSummary; catalog: PiExtensionSandboxCatalog }> | { removed: PiExtensionSandboxPackageSummary; catalog: PiExtensionSandboxCatalog };
  resolveFirstPartyPluginPermission: (input: PiExtensionSandboxUninstallPermissionRequest) => Promise<boolean> | boolean;
  revokePluginGrantsForLabels: (labels: string[]) => number;
  markPluginToolsStale: () => void;
}

export function registerPiExtensionSandboxUninstallTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiExtensionSandboxUninstallToolRegistrationOptions,
): void {
  const discoverPackages = options.discoverPiExtensionSandboxPackages ?? discoverPiExtensionSandboxPackages;
  const uninstallPackage = options.uninstallPiExtensionSandboxPackage ?? uninstallPiExtensionSandboxPackage;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_extension_uninstall_sandboxed"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const thread = options.getThread();
      if (thread.collaborationMode === "planner") throw new Error("Sandboxed Pi extension uninstall is blocked in Planner Mode.");
      const input = params as Record<string, unknown>;
      const packageId = optionalString(input.packageId);
      const packageName = optionalString(input.packageName);
      const catalog = await discoverPackages(options.workspace.path);
      const pkg = selectPiExtensionSandboxPackage(catalog.packages, { packageId, packageName });
      const detail = [`Workspace: ${options.workspace.path}`, `Package: ${pkg.name}`, `Package id: ${pkg.id}`, `Package root: ${pkg.rootPath}`].join("\n");
      const allowed = await options.resolveFirstPartyPluginPermission({
        thread,
        workspace: options.workspace,
        toolName: "ambient_pi_extension_uninstall_sandboxed",
        title: `Uninstall sandboxed Pi extension "${pkg.name}"?`,
        message: "Ambient wants to remove this sandboxed Pi extension and its copied package files.",
        detail,
        grantTargetLabel: `Uninstall sandboxed Pi extension ${pkg.name}`,
        grantTargetIdentity: ["ambient_pi_extension_uninstall_sandboxed", pkg.id].join("\0"),
        allowedReason: "Sandboxed Pi extension uninstall approved by Ambient permission grant policy.",
        deniedReason: "Sandboxed Pi extension uninstall prompt denied or timed out.",
      });
      if (!allowed) throw new Error("Sandboxed Pi extension uninstall blocked by approval prompt.");
      onUpdate?.({
        content: [{ type: "text", text: `Uninstalling sandboxed Pi extension "${pkg.name}".` }],
        details: { runtime: "pi-extension-sandbox", toolName: "ambient_pi_extension_uninstall_sandboxed", packageId: pkg.id, packageName: pkg.name, status: "uninstalling" },
      });
      await uninstallPackage(options.workspace.path, { packageId: pkg.id });
      const revokedGrants = options.revokePluginGrantsForLabels([`Run sandboxed Pi extension ${pkg.name}:`, `Install sandboxed Pi extension ${pkg.name}`, `Uninstall sandboxed Pi extension ${pkg.name}`]);
      options.markPluginToolsStale();
      return {
        content: [{ type: "text" as const, text: piExtensionSandboxUninstallText(pkg, revokedGrants) }],
        details: {
          runtime: "pi-extension-sandbox",
          toolName: "ambient_pi_extension_uninstall_sandboxed",
          packageId: pkg.id,
          packageName: pkg.name,
          revokedGrants,
          availability: "next-session-refresh",
        },
      };
    },
  });
}

function piExtensionSandboxUninstallText(pkg: PiExtensionSandboxPackageSummary, revokedGrants: number): string {
  return [
    "Sandboxed Pi extension uninstalled",
    `Package: ${pkg.name}`,
    `Package id: ${pkg.id}`,
    `Revoked grants: ${revokedGrants}`,
    "Declared tools will be unavailable after the Pi session refreshes or on the next turn.",
    "Audit history is preserved.",
  ].join("\n");
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
