import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import type { WorkspaceState } from "../shared/types";
import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  disablePiPrivilegedPackage,
  discoverPiPrivilegedPackages,
  selectPiPrivilegedPackage,
  type PiPrivilegedCatalog,
  type PiPrivilegedInstallSummary,
  type PiPrivilegedPackageSelector,
} from "./piPrivilegedPackages";

type ToolUpdateHandler = (update: {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}) => void;

export interface PiPrivilegedDisableToolRegistrationOptions {
  workspace: WorkspaceState;
  discoverPiPrivilegedPackages?: (workspacePath: string) => Promise<PiPrivilegedCatalog> | PiPrivilegedCatalog;
  disablePiPrivilegedPackage?: (
    workspacePath: string,
    input: PiPrivilegedPackageSelector,
  ) => Promise<PiPrivilegedInstallSummary> | PiPrivilegedInstallSummary;
}

export function registerPiPrivilegedDisableTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiPrivilegedDisableToolRegistrationOptions,
): void {
  const discoverPackages = options.discoverPiPrivilegedPackages ?? discoverPiPrivilegedPackages;
  const disablePackage = options.disablePiPrivilegedPackage ?? disablePiPrivilegedPackage;

  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_privileged_disable"), {
    executionMode: "sequential",
    execute: async (_toolCallId, params, _signal, onUpdate?: ToolUpdateHandler) => {
      const input = params as Record<string, unknown>;
      const packageId = optionalString(input.packageId);
      const packageName = optionalString(input.packageName);
      const catalog = await discoverPackages(options.workspace.path);
      const pkg = selectPiPrivilegedPackage(catalog.packages, { packageId, packageName });
      onUpdate?.({
        content: [{ type: "text", text: `Disabling privileged Pi package "${pkg.packageName}".` }],
        details: { runtime: "pi-privileged", toolName: "ambient_pi_privileged_disable", packageId: pkg.id, packageName: pkg.packageName, status: "disabling" },
      });
      const disabled = await disablePackage(options.workspace.path, { packageId: pkg.id });
      return {
        content: [{ type: "text" as const, text: `Privileged Pi package "${disabled.packageName}" is disabled. No hooks, MCP servers, or host config changes are active through Ambient.` }],
        details: { runtime: "pi-privileged", toolName: "ambient_pi_privileged_disable", packageId: disabled.id, packageName: disabled.packageName, status: disabled.status },
      };
    },
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
