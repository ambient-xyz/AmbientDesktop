import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { pluginInstallToolDescriptor } from "./desktopToolRegistry";
import { registerDesktopTool } from "./desktopToolRegistration";
import {
  discoverPiExtensionSandboxPackages,
  type PiExtensionSandboxCatalog,
} from "./piExtensionSandboxPackages";
import {
  discoverPiPrivilegedPackages,
  type PiPrivilegedCatalog,
} from "./piPrivilegedPackages";
import type { WorkspaceState } from "../shared/types";

export interface PiExtensionSandboxHistoryToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  discoverPiExtensionSandboxPackages?: typeof discoverPiExtensionSandboxPackages;
}

export interface PiPrivilegedHistoryToolRegistrationOptions {
  workspace: Pick<WorkspaceState, "path">;
  discoverPiPrivilegedPackages?: typeof discoverPiPrivilegedPackages;
}

export function registerPiExtensionSandboxHistoryTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiExtensionSandboxHistoryToolRegistrationOptions,
): void {
  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_extension_history"), {
    executionMode: "sequential",
    execute: async () => {
      const catalog = await (options.discoverPiExtensionSandboxPackages ?? discoverPiExtensionSandboxPackages)(options.workspace.path);
      return {
        content: [{ type: "text" as const, text: piExtensionSandboxHistoryText(catalog) }],
        details: {
          runtime: "pi-extension-sandbox",
          toolName: "ambient_pi_extension_history",
          installedCount: catalog.packages.length,
          historyCount: catalog.history.length,
          errors: catalog.errors,
        },
      };
    },
  });
}

export function registerPiPrivilegedHistoryTool(
  pi: Pick<ExtensionAPI, "registerTool">,
  options: PiPrivilegedHistoryToolRegistrationOptions,
): void {
  registerDesktopTool(pi, pluginInstallToolDescriptor("ambient_pi_privileged_history"), {
    executionMode: "sequential",
    execute: async () => {
      const catalog = await (options.discoverPiPrivilegedPackages ?? discoverPiPrivilegedPackages)(options.workspace.path);
      return {
        content: [{ type: "text" as const, text: piPrivilegedHistoryText(catalog) }],
        details: {
          runtime: "pi-privileged",
          toolName: "ambient_pi_privileged_history",
          installedCount: catalog.packages.length,
          historyCount: catalog.history.length,
          errors: catalog.errors,
        },
      };
    },
  });
}

function piExtensionSandboxHistoryText(catalog: PiExtensionSandboxCatalog): string {
  return [
    "Sandboxed Pi extension history",
    `Installed packages: ${catalog.packages.length}`,
    catalog.packages.length ? catalog.packages.map((pkg) => `- ${pkg.name} (${pkg.id}); tools: ${pkg.tools.map((tool) => tool.name).join(", ") || "none"}`).join("\n") : "- none installed",
    `Removed packages: ${catalog.history.length}`,
    catalog.history.length ? catalog.history.map((entry) => `- ${entry.name} (${entry.id}); removedAt: ${entry.removedAt}; reason: ${entry.removalReason}`).join("\n") : "- no retained removed-package history",
    catalog.errors.length ? `Catalog errors:\n${catalog.errors.map((error) => `- ${error}`).join("\n")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function piPrivilegedHistoryText(catalog: PiPrivilegedCatalog): string {
  return [
    "Privileged Pi package history",
    `Installed packages: ${catalog.packages.length}`,
    catalog.packages.length ? catalog.packages.map((pkg) => `- ${pkg.packageName} (${pkg.id}); status: ${pkg.status}; scanOrigin: ${pkg.scan.scanOrigin}`).join("\n") : "- none installed",
    `Removed packages: ${catalog.history.length}`,
    catalog.history.length ? catalog.history.map((entry) => `- ${entry.packageName} (${entry.id}); removedAt: ${entry.removedAt}; manualCleanup: ${entry.manualCleanup.length}`).join("\n") : "- no retained removed-package history",
    catalog.errors.length ? `Catalog errors:\n${catalog.errors.map((error) => `- ${error}`).join("\n")}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}
